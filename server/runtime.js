'use strict';

const { initializeStore } = require('./db/store');

function createRuntimeInitializer(initialize = initializeStore) {
  let initialized = false;
  let initializationPromise = null;

  async function ensureRuntimeReady() {
    if (initialized) return;

    if (!initializationPromise) {
      let currentPromise;
      currentPromise = Promise.resolve()
        .then(() => initialize())
        .then((result) => {
          initialized = true;
          return result;
        })
        .catch((error) => {
          if (initializationPromise === currentPromise) {
            initializationPromise = null;
          }
          throw error;
        });

      initializationPromise = currentPromise;
    }

    return initializationPromise;
  }

  function getState() {
    return {
      initialized,
      initializing: Boolean(initializationPromise && !initialized),
    };
  }

  function resetForTests() {
    initialized = false;
    initializationPromise = null;
  }

  return {
    ensureRuntimeReady,
    getState,
    resetForTests,
  };
}

const runtime = createRuntimeInitializer();

module.exports = {
  createRuntimeInitializer,
  ensureRuntimeReady: runtime.ensureRuntimeReady,
  getRuntimeState: runtime.getState,
  resetRuntimeForTests: runtime.resetForTests,
};
