export const QUIZ_GUARD_KEY = '__novarquiz_quiz_guard';

/** A same-URL history entry catches Back before the App Router leaves the quiz. */
export function installQuizExitGuard(browser: Window, message: () => string) {
  const url = browser.location.href;
  const guardedState = { ...browser.history.state, [QUIZ_GUARD_KEY]: url };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = '';
  };
  const dispose = () => {
    browser.removeEventListener('popstate', onPopState, true);
    browser.removeEventListener('beforeunload', beforeUnload);
  };
  function onPopState(event: PopStateEvent) {
    if (event.state?.[QUIZ_GUARD_KEY] === url) return;
    const samePage = browser.location.href === url;
    if (browser.confirm(message())) {
      dispose();
      if (samePage) {
        event.stopImmediatePropagation();
        browser.history.back();
      }
      return;
    }
    event.stopImmediatePropagation();
    if (samePage) browser.history.forward();
    else browser.history.pushState(guardedState, '', url);
  }
  browser.addEventListener('popstate', onPopState, true);
  browser.addEventListener('beforeunload', beforeUnload);
  // Reuse the entry on refresh or React Strict Mode remounts.
  if (browser.history.state?.[QUIZ_GUARD_KEY] !== url) browser.history.pushState(guardedState, '', url);
  return dispose;
}
