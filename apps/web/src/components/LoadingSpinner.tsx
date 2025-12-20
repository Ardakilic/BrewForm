/**
 * BrewForm Loading Spinner Component
 */

import { useStyletron } from 'baseui';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  fullScreen?: boolean;
}

function LoadingSpinner({ size = 'medium', fullScreen = false }: LoadingSpinnerProps) {
  const [css] = useStyletron();

  const sizeMap = {
    small: 24,
    medium: 40,
    large: 64,
  };

  const spinnerSize = sizeMap[size];

  const spinner = (
    <div
      className={css({
        width: `${spinnerSize}px`,
        height: `${spinnerSize}px`,
        border: '3px solid #f0f0f0',
        borderTop: '3px solid #6F4E37',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      })}
    />
  );

  if (fullScreen) {
    return (
      <div
        className={css({
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          zIndex: 1000,
        })}
      >
        {spinner}
      </div>
    );
  }

  return (
    <div
      className={css({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      })}
    >
      {spinner}
    </div>
  );
}

export default LoadingSpinner;
