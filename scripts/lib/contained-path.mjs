import path from 'node:path'

// Return true only when `target` resolves to `root` itself or a path strictly
// inside it. Used to reject markdown link targets that escape the project root
// (e.g. `../../../../etc/passwd`) before any filesystem access on the resolved
// path. Both arguments are resolved to absolute form first so a relative or
// `..`-laden input cannot slip through.
export function isWithinRoot(root, target) {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  if (resolvedTarget === resolvedRoot) return true
  const relative = path.relative(resolvedRoot, resolvedTarget)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}
