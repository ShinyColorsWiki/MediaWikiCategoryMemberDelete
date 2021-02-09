import {Command, flags} from '@oclif/command'
import {cli} from 'cli-ux'
import {mwn} from 'mwn'

class MediaWikiDeleteCategory extends Command {
  static description = 'describe the command here'

  static flags = {
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
    api: flags.string({char: 'u', description: 'MediaWiki Api Endpoint.', default: 'https://shinycolors.wiki/w/api.php'}),
    category: flags.string({char: 'c', description: 'Category to delete', default: 'Category:Candidates for deletion'}),
    auto: flags.boolean({char: 'y', description: 'Automatically delete the page and files, (Used file won\'t delete)'}),
    force: flags.boolean({char: 'f', dependsOn: ['auto'], description: 'Force delete used files.'}),
    reason: flags.string({char: 'r', description: 'Delete reason', default: 'Automatically Deleted by Tool'}),
  }

  static args = [{name: 'username', required: true}, {name: 'password', required: true}]

  async run() {
    const {args, flags} = this.parse(MediaWikiDeleteCategory)
    const bot = await mwn.init({
      apiUrl: flags.api,
      username: args.username,
      password: args.password,
    })

    let candidates: string[] = []
    for await (const json of bot.continuedQueryGen({
      action: 'query',
      list: 'categorymembers',
      cmtitle: flags.category,
      cmlimit: 'max',
    })) {
      const users = json.query.categorymembers.map((member: any) => member.title)
      candidates = candidates.concat(users)
    }

    console.log('Fetching Pages/Images complete. Deleting pages...')

    const notDeleted: [string, string[]][] = []
    for (const title of candidates) {
      if (!(flags.auto || await cli.confirm(`Are you sure to delete "${title}"?`))) {
        continue
      }

      let linksHere: string[] = []
      for await (const json of bot.continuedQueryGen({
        action: 'query',
        list: 'backlinks',
        bltitle: title,
        bllimit: 'max',
      })) {
        const users = json.query.backlinks.map((member: any) => member.title)
        linksHere = linksHere.concat(users)
      }

      if (title.startsWith('File:')) {
        for await (const json of bot.continuedQueryGen({
          action: 'query',
          list: 'imageusage',
          iutitle: title,
          iulimit: 'max',
        })) {
          const users = json.query.imageusage.map((member: any) => member.title)
          linksHere = linksHere.concat(users)
        }
      }

      const processDelete = () => {
        console.log(`Deleting "${title}"...`)
        bot.delete(title, flags.reason)
      }

      if (linksHere.length > 0) {
        console.log(`"${title}" has backlink/usage for following pages/files: "${linksHere.join('", "')}"`)

        if (flags.auto) {
          if (!flags.force) {
            console.log(`Ignoring ${title}`)
            notDeleted.push([title, linksHere])
            continue
          }
        } else if (!(await cli.confirm(`Are you REALLY sure to DELETE "${title}"?`))) {
          continue
        }
      }

      processDelete()
    }
    if (notDeleted.length > 0) {
      const tree = cli.tree()
      for (const arr of notDeleted) {
        tree.insert(arr[0])
        for (const sub of arr[1]) {
          tree.nodes[arr[0]].insert(sub)
        }
      }
      console.log('\n\nFollowing Trees are about Pages/Files that not deleted due to usage.')
      tree.display()
    }
  }
}

export = MediaWikiDeleteCategory
