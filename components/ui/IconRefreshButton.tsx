import LucideIcon from './icons/LucideIcon';
import styles from './icon-refresh-button.module.css';

export default function IconRefreshButton({ onRefresh, label, disabled = false }: { onRefresh: () => void; label: string; disabled?: boolean }) {
  return <button type="button" className={styles.button} onClick={onRefresh} disabled={disabled} aria-label={label} title={label}><LucideIcon name="refresh-cw" /></button>;
}
