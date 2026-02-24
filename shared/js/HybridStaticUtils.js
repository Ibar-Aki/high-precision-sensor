export function toPositiveInt(value, fallback) {
    if (!Number.isFinite(value)) return fallback;
    const normalized = Math.round(value);
    return normalized > 0 ? normalized : fallback;
}

export function resetStaticBuffer(state) {
    state.staticPitchBuffer = [];
    state.staticRollBuffer = [];
    state.staticBufferStart = 0;
    state.staticPitchSum = 0;
    state.staticRollSum = 0;
    state.staticSampleCount = 0;
}

export function resetMotionWindow(state) {
    state.motionWindow = [];
    state.motionWindowStart = 0;
    state.motionWindowSum = 0;
    state.motionWindowSqSum = 0;
    state.measurementVariance = Infinity;
    state._prevKfPitch = null;
    state._prevKfRoll = null;
}

export function updateMotionWindow(state, kfPitch, kfRoll, windowSize) {
    if (state._prevKfPitch === null || state._prevKfRoll === null) {
        state._prevKfPitch = kfPitch;
        state._prevKfRoll = kfRoll;
        pushMotionMetric(state, 0, windowSize);
        return;
    }

    const deltaPitch = kfPitch - state._prevKfPitch;
    const deltaRoll = kfRoll - state._prevKfRoll;
    const metric = Math.sqrt(deltaPitch * deltaPitch + deltaRoll * deltaRoll);

    state._prevKfPitch = kfPitch;
    state._prevKfRoll = kfRoll;
    pushMotionMetric(state, metric, windowSize);
}

export function pushMotionMetric(state, metric, windowSize) {
    const safeMetric = Number.isFinite(metric) ? metric : 0;
    state.motionWindow.push(safeMetric);
    state.motionWindowSum += safeMetric;
    state.motionWindowSqSum += safeMetric * safeMetric;

    while (state.motionWindow.length - state.motionWindowStart > windowSize) {
        const dropped = state.motionWindow[state.motionWindowStart];
        state.motionWindowStart += 1;
        state.motionWindowSum -= dropped;
        state.motionWindowSqSum -= dropped * dropped;
    }

    compactMotionWindowIfNeeded(state);

    const sampleCount = state.motionWindow.length - state.motionWindowStart;
    if (sampleCount <= 0) {
        state.measurementVariance = Infinity;
        return;
    }

    const mean = state.motionWindowSum / sampleCount;
    const variance = state.motionWindowSqSum / sampleCount - mean * mean;
    state.measurementVariance = variance > 0 ? variance : 0;
}

export function isStaticDetected(state, windowSize, threshold) {
    const sampleCount = state.motionWindow.length - state.motionWindowStart;
    if (sampleCount < windowSize) return false;
    return state.measurementVariance <= threshold;
}

export function pushStaticSample(state, pitch, roll, maxSize) {
    state.staticPitchBuffer.push(pitch);
    state.staticRollBuffer.push(roll);
    state.staticPitchSum += pitch;
    state.staticRollSum += roll;

    while (state.staticPitchBuffer.length - state.staticBufferStart > maxSize) {
        state.staticPitchSum -= state.staticPitchBuffer[state.staticBufferStart];
        state.staticRollSum -= state.staticRollBuffer[state.staticBufferStart];
        state.staticBufferStart += 1;
    }

    compactStaticBuffersIfNeeded(state);
    state.staticSampleCount = state.staticPitchBuffer.length - state.staticBufferStart;
}

function compactMotionWindowIfNeeded(state) {
    if (state.motionWindowStart < 256 || state.motionWindowStart * 2 < state.motionWindow.length) {
        return;
    }
    state.motionWindow = state.motionWindow.slice(state.motionWindowStart);
    state.motionWindowStart = 0;
}

function compactStaticBuffersIfNeeded(state) {
    if (state.staticBufferStart < 256 || state.staticBufferStart * 2 < state.staticPitchBuffer.length) {
        return;
    }
    state.staticPitchBuffer = state.staticPitchBuffer.slice(state.staticBufferStart);
    state.staticRollBuffer = state.staticRollBuffer.slice(state.staticBufferStart);
    state.staticBufferStart = 0;
}