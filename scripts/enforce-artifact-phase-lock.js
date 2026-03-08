#!/usr/bin/env node
/**
 * Enforce canonical artifact-phase lock from machine state.
 *
 * Blocks local APK builds, release-gate runs, and staging deploys until
 * RELEASES/CLAUDE_CURRENT_STATE.json explicitly marks artifactPhaseEligible=true.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const currentStatePath = path.join(root, 'RELEASES', 'CLAUDE_CURRENT_STATE.json');
const journeyMapPath = path.join(root, 'RELEASES', 'JOURNEY_MAP.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getArgValue(name, fallback) {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (!arg) return fallback;
  return arg.slice(name.length + 1);
}

function fail(message) {
  console.error(`[BLOCK] ${message}`);
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function main() {
  const mode = getArgValue('--mode', 'artifact');

  if (!fs.existsSync(currentStatePath)) {
    fail('Missing RELEASES/CLAUDE_CURRENT_STATE.json');
    process.exit(1);
  }

  const currentState = readJson(currentStatePath);
  const journeyMap = fs.existsSync(journeyMapPath) ? readJson(journeyMapPath) : null;
  const framework = currentState.cccFramework || {};
  const productionModel = currentState.productionGradeCertificationModel || {};
  const lock = productionModel.artifactExecutionLock || framework.artifactExecutionLock;

  if (!lock) {
    fail('artifactExecutionLock missing from canonical machine state');
    process.exit(1);
  }

  if (lock.artifactPhaseEligible === true) {
    pass(`Artifact phase allowed for mode=${mode}`);
    process.exit(0);
  }

  const currentJourney = framework.currentJourney || 'UNKNOWN';
  const currentPhase = framework.currentPhase || 'UNKNOWN';
  const posSuite = productionModel.posSuiteExecutionLock || framework.posSuiteExecutionLock || {};
  const posJourneys = Array.isArray(posSuite.journeyOrder) ? posSuite.journeyOrder : [];
  const nonReadyPosJourneys = [];

  if (journeyMap && journeyMap.journeys) {
    for (const journeyId of posJourneys) {
      const journey = journeyMap.journeys[journeyId];
      const status = journey && journey.status;
      const allowed = status === 'PARK-READY' || status === 'CERT-SEALED' || status === 'CERT-BLOCKED';
      if (!allowed) {
        nonReadyPosJourneys.push(`${journeyId}:${status || 'UNKNOWN'}`);
      }
    }
  }

  fail(`Artifact phase locked for mode=${mode}`);
  console.error(`  currentPhase: ${currentPhase}`);
  console.error(`  currentJourney: ${currentJourney}`);
  console.error(`  reason: ${lock.currentReason || 'unspecified'}`);
  console.error(`  unlockCondition: ${lock.unlockCondition || 'unspecified'}`);
  if (nonReadyPosJourneys.length > 0) {
    console.error(`  nonReadyPosJourneys: ${nonReadyPosJourneys.join(', ')}`);
  }
  process.exit(1);
}

main();
