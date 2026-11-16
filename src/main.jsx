import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Global ResizeObserver polyfill for Samsung Tizen TV (Chromium < 64)
if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      this.handleResize = () => {
        const entries = Array.from(this.targets).map((target) => ({
          target,
          contentRect: target ? target.getBoundingClientRect() : { width: 0, height: 0, top: 0, left: 0 }
        }));
        try {
          this.callback(entries, this);
        } catch (e) {
          console.warn('ResizeObserver callback error:', e);
        }
      };
      window.addEventListener('resize', this.handleResize);
    }
    observe(target) {
      if (target) {
        this.targets.add(target);
        setTimeout(() => {
          try {
            this.callback([{ target, contentRect: target.getBoundingClientRect() }], this);
          } catch (e) {}
        }, 16);
      }
    }
    unobserve(target) {
      this.targets.delete(target);
    }
    disconnect() {
      this.targets.clear();
      window.removeEventListener('resize', this.handleResize);
    }
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
