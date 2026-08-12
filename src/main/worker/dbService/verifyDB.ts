import type Database from 'better-sqlite3'
import tables from './tables'

const normalizeSchemaSql = (sql: string) => sql
  .replace(/\bIF\s+NOT\s+EXISTS\b/gi, '')
  .replace(/\n|\s|;|--.+/g, '')

export default (db: Database.Database) => {
  const result = db
    .prepare<[]>('SELECT type,name,tbl_name,sql FROM "main".sqlite_master WHERE sql NOT NULL;')
    .all() as Array<{ type: string; name: string; tbl_name: string; sql: string }>
  const dbTableMap = new Map<string, string>()
  for (const info of result) dbTableMap.set(info.name, normalizeSchemaSql(info.sql))
  return Array.from(tables.entries()).every(([name, sql]) => {
    const dbSql = dbTableMap.get(name)
    // if (!(dbSql && dbSql == sql.replace(rxp, ''))) {
    //   console.log('dbSql：', dbSql, '\nsql：', sql.replace(rxp, ''))
    // }
    // return true
    return dbSql && dbSql == normalizeSchemaSql(sql)
  })
  // console.log(dbTableMap)
  // for (const [name, sql] of tables.entries()) {
  //   const dbSql = dbTableMap.get(name)
  //   if (dbSql) {
  //     if (dbSql == sql.replace(rxp, '')) continue
  //     console.log(dbSql)
  //     console.log(sql.replace(rxp, ''))
  //   } else {
  //     console.log(name)
  //   }
  // }
  // if (result.every((info) => { tables.includes() }))
}
