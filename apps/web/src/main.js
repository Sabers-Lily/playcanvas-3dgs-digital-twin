import { createApp } from 'vue';
import App from './App.vue';
import './styles/tokens.css';
import './styles/editor-ui.css';

if (typeof window !== 'undefined' && window.desktopShell?.isElectron) {
  document.documentElement.classList.add('is-desktop-shell');
  document.body.classList.add('is-desktop-shell');
}

createApp(App).mount('#app-root');
