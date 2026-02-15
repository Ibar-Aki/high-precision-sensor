export class LifecycleManager {
    constructor({ onBeforeUnload, onHidden }) {
        this.onBeforeUnload = onBeforeUnload;
        this.onHidden = onHidden;
        this._beforeUnloadHandler = () => {
            this.onBeforeUnload?.();
        };
        this._visibilityHandler = () => {
            if (document.hidden) {
                this.onHidden?.();
            }
        };
        this._isBound = false;
    }

    bind() {
        if (this._isBound) return;
        window.addEventListener('beforeunload', this._beforeUnloadHandler);
        document.addEventListener('visibilitychange', this._visibilityHandler);
        this._isBound = true;
    }

    destroy() {
        if (!this._isBound) return;
        window.removeEventListener('beforeunload', this._beforeUnloadHandler);
        document.removeEventListener('visibilitychange', this._visibilityHandler);
        this._isBound = false;
    }
}
