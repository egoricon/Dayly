import type { AppData, LocalDate } from './domain/types';
import { upgradeData } from './storage';

// «Сохранить копию» / «Восстановить из копии»: all data in one JSON file, so a new phone
// or a cleared browser does not lose it.

interface BackupFile {
  app: 'dayly';
  exportedAt: string; // ISO time
  data: AppData;
}

export function backupFileName(today: LocalDate): string {
  return `dayly-${today}.json`;
}

export function makeBackup(data: AppData, now: Date): string {
  const file: BackupFile = { app: 'dayly', exportedAt: now.toISOString(), data };
  return JSON.stringify(file, null, 1);
}

export interface ParsedBackup {
  data: AppData;
  exportedAt: string | null;
}

/** Reads a backup, upgrading older versions. Null when the file is not a Dayly backup. */
export function parseBackup(text: string): ParsedBackup | null {
  try {
    const parsed = JSON.parse(text) as Partial<BackupFile> | null;
    if (!parsed || parsed.app !== 'dayly') return null;
    const data = upgradeData(parsed.data);
    return data ? { data, exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null } : null;
  } catch {
    return null;
  }
}

/** Hands the file to the phone: the share sheet where files can be shared (iOS, Android), otherwise a download. */
export async function saveBackupFile(text: string, name: string): Promise<void> {
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Dayly — копия данных' });
      return;
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
