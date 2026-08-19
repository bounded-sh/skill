import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// HIGH-004: the amend:"creator" three-step "dance" for updating a locked site
// (loosen the boundary -> deploy the site -> re-apply the lock) is an OPEN WINDOW:
// while the boundary is loosened the lock is off, so every author can deploy, and
// step 3 re-applies the lock without checking what landed - re-lock on top of a
// collaborator's deploy and the lock now protects their code. The playbook taught
// the dance without stating either danger. This asserts it now does.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const playbook = readFileSync(path.join(root, 'bounded-deploy/docs/access-playbook.md'), 'utf8')

// The dance section runs from the amend:"creator" bullet to the next numbered step.
function danceSection() {
  const start = playbook.indexOf('amend: "creator"')
  assert.notEqual(start, -1, 'expected the amend:"creator" three-step dance in access-playbook.md')
  const rest = playbook.slice(start)
  const next = rest.indexOf('amend: "none"')
  return next === -1 ? rest : rest.slice(0, next)
}

test('HIGH-004: the three-step dance warns that steps 1-3 are an open window every author can deploy in', () => {
  const dance = danceSection()
  assert.match(
    dance,
    /open window|window in which|while the boundary is loosened/i,
    'the amend:"creator" dance must state that loosening the boundary opens a window in which every author can deploy',
  )
  assert.match(
    dance,
    /every author|any author/i,
    'the dance must say who can deploy in that window (every author), not leave the danger implicit',
  )
})

test('HIGH-004: step 3 tells the operator to verify what landed before re-locking', () => {
  const dance = danceSection()
  assert.match(
    dance,
    /before (step )?③|before re-?applying|before re-?lock/i,
    'the dance must tell the operator to check BEFORE re-applying the lock',
  )
  assert.match(
    dance,
    /did not deploy|you did not make|someone else|a collaborator|nothing landed/i,
    're-locking on top of a deploy you did not make protects their code - the dance must warn to verify what landed first',
  )
})

test('HIGH-004: the dance tells the operator to complete it in one sitting', () => {
  const dance = danceSection()
  assert.match(
    dance,
    /one sitting|never leave the boundary loosened|do the whole dance/i,
    'the dance must tell the operator not to leave the boundary loosened between steps',
  )
})
