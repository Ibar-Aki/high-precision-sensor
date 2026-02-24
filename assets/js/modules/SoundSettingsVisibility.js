export function refreshSoundSettingsVisibility(audio, doc = document) {
    const isNormalOutput = audio?.outputType === 'normal';
    const isThresholdMode = audio?.mode === 'threshold';

    const normalSoundSettings = doc.getElementById('normal-sound-settings');
    if (normalSoundSettings) {
        normalSoundSettings.style.display = isNormalOutput ? 'block' : 'none';
    }

    const thresholdSetting = doc.getElementById('threshold-setting');
    if (thresholdSetting) {
        thresholdSetting.style.display = isNormalOutput && isThresholdMode ? 'block' : 'none';
    }
}