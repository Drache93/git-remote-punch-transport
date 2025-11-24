/** @typedef {import('pear-interface')} */ /* global Pear */
import { PunchLocalDB } from '../lib/db'
import goodbye from 'graceful-goodbye'

import './remotes'

const db = new PunchLocalDB()

goodbye(async () => {
  await db.close()
})

await db.ready()

globalThis.db = db

document.querySelector('main').appendChild(document.createElement('remotes-list'))

const remotes = await db.openRemotes()

console.log(remotes)
