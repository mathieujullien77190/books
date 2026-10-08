import type { ToastProps } from './types';

/**
 * Message bref en haut de l'écran. La zone d'annonce (role="status") reste toujours dans la page,
 * vide quand il n'y a rien à dire : c'est ce qui permet aux lecteurs d'écran de lire le texte qui arrive.
 */
const Toast = ({ message }: ToastProps) => (
  <div
    role="status"
    className={
      message
        ? 'pointer-events-none fixed top-[88px] left-1/2 z-40 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 rounded-2xl bg-ink px-4 py-3 text-center text-sm text-white shadow-[0_10px_30px_rgba(31,42,55,0.3)]'
        : 'sr-only'
    }
  >
    {message}
  </div>
);

export default Toast;
