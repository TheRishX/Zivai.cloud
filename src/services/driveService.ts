import { auth, googleProvider } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

const GDRIVE_TOKEN_KEY = 'vault_gdrive_access_token_v1';
const GDRIVE_SYNC_ENABLED_KEY = 'vault_gdrive_sync_enabled_v1';

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  webViewLink?: string;
}

export const getDriveAccessToken = (): string | null => {
  try {
    return localStorage.getItem(GDRIVE_TOKEN_KEY);
  } catch (e) {
    console.error("Failed to read Google Drive access token:", e);
    return null;
  }
};

export const setDriveAccessToken = (token: string | null): void => {
  try {
    if (token) {
      localStorage.setItem(GDRIVE_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(GDRIVE_TOKEN_KEY);
    }
  } catch (e) {
    console.error("Failed to set Google Drive access token:", e);
  }
};

export const isDriveSyncEnabled = (): boolean => {
  try {
    const val = localStorage.getItem(GDRIVE_SYNC_ENABLED_KEY);
    return val === null ? true : val === 'true'; // Default to enabled if connected
  } catch (e) {
    return true;
  }
};

export const setDriveSyncEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(GDRIVE_SYNC_ENABLED_KEY, String(enabled));
  } catch (e) {
    console.error("Failed to save Drive sync preference:", e);
  }
};

export const connectGoogleDrive = async (): Promise<string | null> => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;
    if (accessToken) {
      setDriveAccessToken(accessToken);
      return accessToken;
    }
    return null;
  } catch (err) {
    console.error("Google Drive connection failure:", err);
    throw err;
  }
};

export const disconnectGoogleDrive = (): void => {
  setDriveAccessToken(null);
  setDriveSyncEnabled(false);
};

// Sync with ZivAi designated folder in user's Google Drive.
// Fetches list of PDFs from the target 'ZivAi' folder.
export const fetchZivAiFolderFiles = async (token: string): Promise<DriveFileInfo[]> => {
  if (!token) {
    throw new Error("Missing authorization token for Google Drive integration");
  }

  const response = await fetch('/api/drive/zivai-sync', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const errRes = await response.json().catch(() => ({}));
    throw new Error(errRes.error || `Sync server error (${response.status})`);
  }

  const data = await response.json();
  return data.files || [];
};
