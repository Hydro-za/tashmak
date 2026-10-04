/* The embedded build has no Settings/Wizard/boot (those live in the management app). Minimal stubs keep shared code paths valid. */
function viewSettings() { return ''; }
const useCap = async () => null;
function afterSettingsRender() {}
function onSettingsChange() {}
function onWizardInput() {}
