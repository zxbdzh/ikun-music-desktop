import { getDB } from '../db'

/**
 * 在事务中批量执行 statement
 */
export const batchRun = <T>(items: T[], createStatement: () => { run: (item: T) => void }) => {
  const db = getDB()
  const statement = createStatement()
  db.transaction((items: T[]) => {
    for (const item of items) statement.run(item)
  })(items)
}

/**
 * 在事务中先删后插（upsert 模式）
 */
export const batchUpsert = <T>(
  items: T[],
  createDeleteStatement: () => { run: (item: T) => void },
  createInsertStatement: () => { run: (item: T) => void }
) => {
  const db = getDB()
  const deleteStmt = createDeleteStatement()
  const insertStmt = createInsertStatement()
  db.transaction((items: T[]) => {
    for (const item of items) {
      deleteStmt.run(item)
      insertStmt.run(item)
    }
  })(items)
}

/**
 * 执行清空操作
 */
export const runClear = (createStatement: () => { run: () => void }) => {
  createStatement().run()
}

/**
 * 执行计数查询
 */
export const runCount = (createStatement: () => { get: () => unknown }): number => {
  return (createStatement().get() as { count: number }).count
}

/**
 * 执行单条查询
 */
export const queryOne = <P, R>(createStatement: () => { get: (param: P) => R | undefined }, param: P): R | undefined => {
  return createStatement().get(param)
}

/**
 * 执行多条查询
 */
export const queryAll = <P, R>(createStatement: () => { all: (...params: P[]) => R[] }, ...params: P[]): R[] => {
  return createStatement().all(...params)
}
