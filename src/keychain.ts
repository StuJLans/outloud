/**
 * macOS Keychain integration for secure API key storage
 */

const SERVICE_NAME = "outloud";

export async function setKeychainPassword(
  account: string,
  password: string
): Promise<boolean> {
  try {
    // Delete existing entry first (if any)
    await Bun.$`security delete-generic-password -a ${account} -s ${SERVICE_NAME}`.quiet();
  } catch {
    // Ignore if doesn't exist
  }

  try {
    await Bun.$`security add-generic-password -a ${account} -s ${SERVICE_NAME} -w ${password}`;
    return true;
  } catch (error) {
    console.error("Failed to store in Keychain:", error);
    return false;
  }
}

export async function getKeychainPassword(
  account: string
): Promise<string | null> {
  try {
    const result = await Bun.$`security find-generic-password -a ${account} -s ${SERVICE_NAME} -w`.text();
    return result.trim();
  } catch {
    return null;
  }
}

export async function deleteKeychainPassword(account: string): Promise<boolean> {
  try {
    await Bun.$`security delete-generic-password -a ${account} -s ${SERVICE_NAME}`.quiet();
    return true;
  } catch {
    return false;
  }
}
