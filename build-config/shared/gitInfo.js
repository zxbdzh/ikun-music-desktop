const { execSync } = require('child_process')

/**
 * 获取当前 git 提交信息
 * @returns {{ commit_id: string, commit_date: string }}
 */
function getGitInfo() {
  const gitInfo = {
    commit_id: '',
    commit_date: '',
  }

  try {
    let isClean = !execSync('git status --porcelain').toString().trim()
    if (process.env.BUILD_WIN7) {
      console.warn('BUILD_WIN7 is set, skipping git status check.')
      console.log('Workspace status:', execSync('git status --porcelain').toString().trim())
      isClean = true
    }
    if (isClean) {
      gitInfo.commit_id = execSync('git log -1 --pretty=format:"%H"').toString().trim()
      gitInfo.commit_date = execSync('git log -1 --pretty=format:"%ad" --date=iso-strict')
        .toString()
        .trim()
    } else if (process.env.IS_CI) {
      throw new Error('Working directory is not clean')
    }
  } catch {}

  return gitInfo
}

module.exports = { getGitInfo }
