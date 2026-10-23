import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

/** The WebCrypto subset AuthJS needs for secure randomness and S256 PKCE on Hermes. */
export function installAuthCrypto() {
  if (Platform.OS === 'web') return;
  const provider = globalThis.crypto ?? ({} as globalThis.Crypto);
  if (!provider.getRandomValues)
    provider.getRandomValues =
      Crypto.getRandomValues as typeof provider.getRandomValues;
  if (!provider.subtle) {
    Object.defineProperty(provider, 'subtle', {
      value: {
        digest: (algorithm: AlgorithmIdentifier, data: BufferSource) => {
          const name =
            typeof algorithm === 'string' ? algorithm : algorithm.name;
          if (name.toUpperCase() !== 'SHA-256')
            throw new Error('Unsupported digest algorithm');
          return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data);
        },
      },
    });
  }
  if (!globalThis.crypto)
    Object.defineProperty(globalThis, 'crypto', {
      value: provider,
      configurable: true,
    });
}
