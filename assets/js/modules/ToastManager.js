export class ToastManager {
    constructor() {
        this._toastTimer = null;
    }

    show(message) {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.style.cssText = `
        position: fixed; bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
        left: 50%; transform: translateX(-50%) translateY(20px);
        padding: 0.6rem 1.2rem; border-radius: 12px;
        background: rgba(0,212,255,0.15); border: 1px solid rgba(0,212,255,0.3);
        color: #00d4ff; font-size: 0.8rem; font-weight: 600;
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        opacity: 0; transition: opacity 0.3s, transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
        z-index: 200; pointer-events: none;
      `;
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(20px)';
        }, 1500);
    }

    showStorageError(operation, reason) {
        if (reason === 'quota_exceeded') {
            this.show(`${operation}に失敗: ストレージ容量が不足しています`);
            return;
        }
        this.show(`${operation}に失敗: ストレージへアクセスできません`);
    }

    destroy() {
        clearTimeout(this._toastTimer);
    }
}
