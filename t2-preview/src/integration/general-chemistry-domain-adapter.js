/**
 * Future integration boundary for the Adaptive Trainer Core.
 *
 * The standalone simulator does not import or fork the core. It exposes
 * domain-owned simulation capabilities that a General Chemistry Domain Adapter
 * can bind to the portable core contract later.
 */
import { SCENARIOS, scenarioById, defaultExperimentFor, configureExperiment } from '../scenarios.js';
import { calculateState } from '../chemistry.js';

export function createGeneralChemistryTitrationAdapter() {
  return {
    id: 'general-chemistry.acid-base-titrations',
    version: '0.2.0',
    bindings: {
      knowledgeGraph: 'acid-base-titration-v1',
      problemFamilyRegistry: 'titration-simulations-v1',
      expertModelProvider: 'acid-base-speciation-v2',
      truthVerifier: 'equilibrium-calculation-v2',
      responseInterpreter: 'reserved-for-adaptive-coaching',
      representationProvider: 'interactive-titration-simulator-v2',
      languageProvider: 'general-chemistry-language-v1'
    },
    listProblems() {
      return SCENARIOS.map((scenario) => ({ id:scenario.id, title:scenario.title, representation:'interactive-titration' }));
    },
    problemForId(id) { return defaultExperimentFor(scenarioById(id)); },
    configureProblem(id, settings) { return configureExperiment(scenarioById(id), settings); },
    verifyProblem(problem) {
      const base = scenarioById(problem?.id);
      return { verified: base.id === problem?.id, scenario: defaultExperimentFor(base) };
    },
    assessAttempt() { return { status:'not-enabled-in-standalone-simulator' }; },
    buildLearnerModel() { return { status:'delegated-to-adaptive-trainer-core' }; },
    selectNextExperience() { return { status:'delegated-to-adaptive-trainer-core' }; },
    simulationState(problemId, titrantMl, settings = null) {
      const base = scenarioById(problemId);
      const configured = settings ? configureExperiment(base, settings) : defaultExperimentFor(base);
      return calculateState(configured, titrantMl);
    }
  };
}
