import Token from './token';

class Authentification {
  /**
   * Generate a random string
   * @param  length
   * @returns String
   */
  generateCode(length = 40): string {
    const characters =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const charactersLength = characters.length;
    const randomValues = new Uint8Array(length);
    window.crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
      const index = randomValues[i] % charactersLength;
      result += characters.charAt(index);
    }
    
    return result;
  }

  sha256(plain: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    return window.crypto.subtle.digest('SHA-256', data);
  }

  /**
   * Encode a code_verifier (ArrayBuffer)
   * @param buffer ArrayBuffer
   * @returns String
   */
  base64urlencode(buffer: ArrayBuffer): string {
    // Convert ArrayBuffer to Uint8Array
    const bytes = new Uint8Array(buffer);

    // Convert each byte to its char equivalent
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });

    // Convert binary string to base64
    const base64 = btoa(binary);

    // Make the base64 string URL-safe
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Generate a new code challenge
   *
   * @returns Promise<string>
   */
  async codeChallenge(): Promise<string> {
    const code_verifier = this.generateCode(128); // Generate 128 char random string
    //localStorage.setItem('code_verifier', code_verifier);
    chrome.storage.local.set({ code_verifier: code_verifier });

    // Generate SHA-256 hash of the code_verifier
    const hashed = await this.sha256(code_verifier);

    // Encode the hash into base64-url safe string
    const base64encoded = this.base64urlencode(hashed);

    return base64encoded;
  }

  /**
   * Redirect to the OAuth2 server to authorize the application
   */
  async signIn() {
    // Generate the state code and store it in session
    const state = this.generateCode(40);
    //localStorage.setItem('state', state);
    chrome.storage.local.set({ state: state })

    // Generate code_challenge
    const code_challenge = await this.codeChallenge();
    

    // Build query string
    const queryParams = new URLSearchParams({
      client_id: import.meta.env.VITE_PASSPORT_SERVER_ID || '',
      redirect_uri: `${import.meta.env.VITE_PASSPORT_PROXY_SERVER}/callback`,
      response_type: 'code',
      scope: '*',
      state: state,
      code_challenge: code_challenge,
      code_challenge_method: 'S256',
      prompt: import.meta.env.VITE_PASSPORT_PROMPT_MODE || '',
    });

    // Redirect to OAuth2 authorization server
    const url = `${import.meta.env.VITE_PASSPORT_SERVER}/oauth/authorize?${queryParams.toString()}`;
    
    await chrome.windows.create({
      url: url,
      type: "popup",
      width: 500,
      height: 600,
    });
  }

  async logout() {
    const tokenClass = new Token();
    const token = await tokenClass.getDecryptedToken();
    chrome.storage.local.remove(['server', 'store']);
    const response = await fetch(`${import.meta.env.VITE_PASSPORT_SERVER}/api/gateway/logout`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      }
    })
    if (response.ok) {
      tokenClass.clearToken();
      //chrome.storage.local.clear();
    }
        
  }
}

export default Authentification;