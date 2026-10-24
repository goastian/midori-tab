import net from 'node:net';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function freePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

class MarionetteConnection {
  constructor(socket) {
    this.socket = socket;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    this.sequence = 0;
    socket.on('data', part => this.receive(part));
    socket.on('error', error => this.fail(error));
    socket.on('close', () => this.fail(new Error('Marionette connection closed')));
  }

  receive(part) {
    this.buffer = Buffer.concat([this.buffer, part]);
    while (this.buffer.length) {
      const delimiter = this.buffer.indexOf(58);
      if (delimiter < 0) return;
      const length = Number(this.buffer.subarray(0, delimiter).toString());
      if (!Number.isInteger(length) || length < 0 || length > 64 * 1024 * 1024) {
        this.fail(new Error('Invalid Marionette packet length'));
        this.socket.destroy();
        return;
      }
      if (this.buffer.length < delimiter + 1 + length) return;
      let message;
      try { message = JSON.parse(this.buffer.subarray(delimiter + 1, delimiter + 1 + length)); }
      catch (error) { this.fail(error); this.socket.destroy(); return; }
      this.buffer = this.buffer.subarray(delimiter + 1 + length);
      if (!Array.isArray(message)) { this.handshake = message; continue; }
      const entry = this.pending.get(message[1]);
      if (!entry) continue;
      this.pending.delete(message[1]);
      clearTimeout(entry.timer);
      if (message[2]) entry.reject(new Error(`${entry.command}: ${message[2].error}: ${message[2].message}`));
      else entry.resolve(message[3]);
    }
  }

  send(command, parameters = {}, timeout = 30_000) {
    if (this.socket.destroyed) return Promise.reject(new Error('Marionette connection closed'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${command} timed out after ${timeout} ms`));
      }, timeout);
      this.pending.set(id, { command, resolve, reject, timer });
      const payload = JSON.stringify([0, id, command, parameters]);
      this.socket.write(`${Buffer.byteLength(payload)}:${payload}`);
    });
  }

  fail(error) {
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    this.pending.clear();
  }

  close() { this.socket.destroy(); }
}

async function connect(port, process, log) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null || process.signalCode !== null) {
      throw new Error(`Gecko exited before Marionette was ready: ${log()}`);
    }
    try {
      const socket = net.connect(port, '127.0.0.1');
      await once(socket, 'connect');
      return new MarionetteConnection(socket);
    } catch (error) {
      if (!['ECONNREFUSED', 'ECONNRESET'].includes(error.code)) throw error;
      await pause(100);
    }
  }
  throw new Error(`Marionette did not start on loopback port ${port}: ${log()}`);
}

function installObservers({ addonId, origin }) {
  const errors = [];
  const requests = new Map();
  const state = { active: false, addonId, origin, errors, requests, sequence: 0, errorOffset: 0 };
  function redactUrl(value) {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    url.username = '';
    url.password = '';
    return url.href;
  }
  function belongsToExtension(channel) {
    return [channel.loadInfo.loadingPrincipal, channel.loadInfo.triggeringPrincipal, channel.loadInfo.principalToInherit]
      .some(principal => principal && (principal.addonId === addonId || principal.URI?.spec?.startsWith(origin)));
  }
  const observer = {
    observe(subject, topic) {
      try {
        const channel = subject.QueryInterface(Ci.nsIHttpChannel);
        const channelId = String(channel.channelId);
        if (topic === 'http-on-modify-request') {
          if (!state.active || !belongsToExtension(channel)) return;
          const info = channel.loadInfo;
          const context = info.browsingContextID ? BrowsingContext.get(info.browsingContextID) : null;
          const documentUrl = info.loadingDocument?.documentURI || context?.currentWindowGlobal?.documentURI?.spec || '';
          const scope = documentUrl.includes('_generated_background_page.html') ? 'background'
            : documentUrl.startsWith(origin) ? 'page' : 'extension';
          requests.set(channelId, { id: ++state.sequence, url: redactUrl(channel.URI.spec),
            documentUrl: documentUrl ? redactUrl(documentUrl) : '', scope,
            startEpochMs: Date.now(), endEpochMs: null, state: 'pending', bytes: null });
        } else if (topic === 'http-on-stop-request') {
          const request = requests.get(channelId);
          if (!request) return;
          request.endEpochMs = Date.now();
          request.state = channel.status === Cr.NS_BINDING_ABORTED ? 'cancelled'
            : Components.isSuccessCode(channel.status) ? 'finished' : 'failed';
          const size = channel.transferSize;
          request.bytes = Number.isFinite(size) && size >= 0 ? size : null;
        }
      } catch (error) {
        state.observerError = String(error);
      }
    },
  };
  const listener = {
    observe(message) {
      try {
        const error = message.QueryInterface(Ci.nsIScriptError);
        if (!error.sourceName?.startsWith(origin) || (error.flags & Ci.nsIScriptError.warningFlag)) return;
        errors.push({ message: error.errorMessage, source: error.sourceName, line: error.lineNumber,
          epochMs: Date.now() });
        if (errors.length > 200) errors.shift();
      } catch { /* Non-script console messages do not represent page errors. */ }
    },
  };
  Services.obs.addObserver(observer, 'http-on-modify-request');
  Services.obs.addObserver(observer, 'http-on-stop-request');
  Services.console.registerListener(listener);
  state.dispose = () => {
    Services.obs.removeObserver(observer, 'http-on-modify-request');
    Services.obs.removeObserver(observer, 'http-on-stop-request');
    Services.console.unregisterListener(listener);
  };
  window.__midoriHarness = state;
  return { source: 'gecko-http-observer', scopes: ['page', 'background', 'extension'],
    protocols: ['http:', 'https:'], localExtensionResources: 'not-observed',
    filtering: 'extension loading or triggering principal', cancelledRequests: true, responseBytes: 'when available' };
}

export async function openGeckoSession({ extensionPath, executablePath = process.env.MIDORI_FIREFOX_EXECUTABLE || '/usr/bin/midori',
  viewport = { width: 1280, height: 800 }, headless = true } = {}) {
  if (!extensionPath) throw new Error('Gecko transport requires extensionPath');
  const manifest = JSON.parse(readFileSync(join(extensionPath, 'manifest.json')));
  const addonId = manifest.browser_specific_settings?.gecko?.id;
  if (!addonId) throw new Error('Gecko transport requires a Firefox extension manifest with an explicit addon ID');
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'midori-gecko-profile-'));
  const preferences = {
    'marionette.port': port,
    'marionette.enabled': true,
    'browser.shell.checkDefaultBrowser': false,
    'browser.startup.homepage_override.mstone': 'ignore',
    'browser.startup.page': 0,
    'startup.homepage_welcome_url': 'about:blank',
    'startup.homepage_welcome_url.additional': '',
    'extensions.experiments.enabled': true,
    'xpinstall.signatures.required': false,
    'browser.sessionstore.resume_from_crash': false,
  };
  writeFileSync(join(profile, 'user.js'), Object.entries(preferences)
    .map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join('\n'));
  const args = ['--no-remote', '--profile', profile, '--marionette', '--remote-allow-system-access', 'about:blank'];
  if (headless) args.unshift('--headless');
  const child = spawn(executablePath, args, { env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  let spawnError;
  const appendLog = chunk => { log = (log + chunk).slice(-24_000); };
  child.stdout.on('data', appendLog);
  child.stderr.on('data', appendLog);
  child.on('error', error => { spawnError = error; });
  let client;
  let closed = false;
  let queue = Promise.resolve();
  const pages = new Set();
  const serial = operation => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  async function commandContext(context, handle) {
    await client.send('Marionette:SetContext', { value: context });
    if (handle) await client.send('WebDriver:SwitchToWindow', { handle, focus: true });
  }
  async function selectExistingWindow() {
    const response = await client.send('WebDriver:GetWindowHandles');
    const handles = Array.isArray(response) ? response : response.value;
    if (!Array.isArray(handles) || !handles.length) throw new Error('Gecko has no surviving browser window');
    await client.send('WebDriver:SwitchToWindow', { handle: handles[0], focus: true });
  }
  async function chromeEvaluate(fn, arg) {
    await commandContext('chrome');
    const response = await client.send('WebDriver:ExecuteScript', {
      script: `return (${fn.toString()})(arguments[0]);`, args: [arg ?? null], sandbox: 'midori-harness', newSandbox: false,
    });
    return response.value;
  }
  async function close() {
    if (closed) return;
    closed = true;
    try {
      if (client && !client.socket.destroyed) await serial(() => chromeEvaluate(() => {
        window.__midoriHarness?.dispose();
        delete window.__midoriHarness;
      }));
    } catch { /* The browser may already have exited after a failed navigation. */ }
    client?.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit').catch(() => {}), pause(3000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await Promise.race([once(child, 'exit').catch(() => {}), pause(1000)]);
      }
    }
    rmSync(profile, { recursive: true, force: true });
  }
  try {
    client = await connect(port, child, () => spawnError?.message || log);
    const response = await client.send('WebDriver:NewSession', { acceptInsecureCerts: false, pageLoadStrategy: 'eager',
      timeouts: { implicit: 0, pageLoad: 30_000, script: 30_000 } });
    const capabilities = response.capabilities;
    const application = await serial(() => chromeEvaluate(() => ({ name: Services.appinfo.name,
      version: Services.appinfo.version, platformVersion: Services.appinfo.platformVersion,
      buildId: Services.appinfo.appBuildID })));
    await client.send('Marionette:SetContext', { value: 'chrome' });
    const installed = await client.send('WebDriver:ExecuteAsyncScript', {
      script: `const done = arguments[arguments.length - 1];
        const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
        const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
        file.initWithPath(arguments[0]);
        AddonManager.installTemporaryAddon(file).then(addon => done({ id: addon.id, active: addon.isActive,
          hostname: WebExtensionPolicy.getByID(addon.id)?.mozExtensionHostname }), error => done({ error: String(error) }));`,
      args: [resolve(extensionPath)], sandbox: 'midori-harness', newSandbox: false, scriptTimeout: 30_000,
    });
    if (installed.value.error || !installed.value.active || !installed.value.hostname) {
      throw new Error(`Failed to install complete Firefox extension: ${installed.value.error || JSON.stringify(installed.value)}`);
    }
    const origin = `moz-extension://${installed.value.hostname}/`;
    const coverage = await serial(() => chromeEvaluate(installObservers, { addonId, origin }));
    async function drainErrors(page) {
      const found = await chromeEvaluate(() => {
        const state = window.__midoriHarness;
        const found = state.errors.slice(state.errorOffset);
        state.errorOffset = state.errors.length;
        return found;
      });
      for (const error of found) page.emit('pageerror', new Error(`${error.message} (${error.source}:${error.line})`));
    }
    const context = {
      async newPage() {
        const page = new EventEmitter();
        const handle = await serial(async () => {
          await commandContext('content');
          // Closing a previous test tab discards its current browsing context.
          // Marionette requires a live context even when creating another tab.
          await selectExistingWindow();
          const result = await client.send('WebDriver:NewWindow', { type: 'tab', focus: true });
          await client.send('WebDriver:SwitchToWindow', { handle: result.handle, focus: true });
          const rect = await client.send('WebDriver:SetWindowRect', { width: viewport.width, height: viewport.height });
          const dimensions = await client.send('WebDriver:ExecuteScript', {
            script: 'return { width: innerWidth, height: innerHeight };', args: [], sandbox: null, newSandbox: false,
          });
          await client.send('WebDriver:SetWindowRect', {
            width: rect.width + viewport.width - dimensions.value.width,
            height: rect.height + viewport.height - dimensions.value.height,
          });
          return result.handle;
        });
        page.handle = handle;
        page.goto = (url, { timeout = 30_000 } = {}) => serial(async () => {
          await commandContext('content', handle);
          await client.send('WebDriver:Navigate', { url }, timeout);
          await drainErrors(page);
        });
        page.evaluate = (fn, arg) => serial(async () => {
          await commandContext('content', handle);
          const result = await client.send('WebDriver:ExecuteAsyncScript', {
            script: `const done = arguments[arguments.length - 1];
              Promise.resolve().then(() => (${fn.toString()})(arguments[0])).then(
                value => done({ ok: true, value: value === undefined ? null : value }),
                error => done({ ok: false, error: String(error), stack: error?.stack }));`,
            args: [arg ?? null], sandbox: null, newSandbox: false, scriptTimeout: 30_000,
          });
          await drainErrors(page);
          if (!result.value || typeof result.value.ok !== 'boolean') {
            throw new Error('Gecko evaluation did not complete in the current document; navigation may have replaced it');
          }
          if (!result.value.ok) throw new Error(result.value.stack || result.value.error);
          return result.value.value;
        });
        page.waitForFunction = async (fn, arg, { timeout = 30_000 } = {}) => {
          const deadline = Date.now() + timeout;
          while (Date.now() < deadline) {
            if (await page.evaluate(fn, arg)) return;
            await pause(50);
          }
          throw new Error(`Gecko waitForFunction timed out after ${timeout} ms: ${fn.toString()}`);
        };
        page.fill = (selector, text) => serial(async () => {
          await commandContext('content', handle);
          const result = await client.send('WebDriver:FindElement', { using: 'css selector', value: selector });
          const element = result.value?.['element-6066-11e4-a52e-4f735466cecf'];
          if (!element) throw new Error(`Element not found: ${selector}`);
          await client.send('WebDriver:ElementClear', { id: element });
          await client.send('WebDriver:ElementSendKeys', { id: element, text, value: [...text] });
        });
        page.click = selector => serial(async () => {
          await commandContext('content', handle);
          const result = await client.send('WebDriver:FindElement', { using: 'css selector', value: selector });
          const element = result.value?.['element-6066-11e4-a52e-4f735466cecf'];
          if (!element) throw new Error(`Element not found: ${selector}`);
          await client.send('WebDriver:ElementClick', { id: element });
          await drainErrors(page);
        });
        page.url = () => serial(async () => {
          await commandContext('content', handle);
          const result = await client.send('WebDriver:GetCurrentURL');
          return typeof result === 'string' ? result : result.value;
        });
        page.screenshot = ({ path } = {}) => serial(async () => {
          await commandContext('content', handle);
          const result = await client.send('WebDriver:TakeScreenshot', { id: null, full: false, scroll: false });
          const bytes = Buffer.from(result.value, 'base64');
          if (path) writeFileSync(path, bytes);
          return bytes;
        });
        page.close = async () => {
          if (!pages.delete(page) || closed) return;
          await serial(async () => {
            await commandContext('content', handle);
            await client.send('WebDriver:CloseWindow');
            await selectExistingWindow();
          });
        };
        pages.add(page);
        return page;
      },
      close,
    };
    const network = {
      coverage,
      start: () => serial(() => chromeEvaluate(() => {
        const state = window.__midoriHarness;
        state.requests.clear();
        state.sequence = 0;
        state.observerError = null;
        state.active = true;
        return { startEpochMs: Date.now() };
      })),
      stop: () => serial(() => chromeEvaluate(() => {
        const state = window.__midoriHarness;
        state.active = false;
        if (state.observerError) throw new Error(`HTTP observer failed: ${state.observerError}`);
        return [...state.requests.values()];
      })),
    };
    return { context, url: `${origin}index.html`, profile, network,
      metadata: { transport: 'marionette', executablePath: resolve(executablePath), application,
        browserName: capabilities.browserName, browserVersion: capabilities.browserVersion,
        userAgent: capabilities.userAgent, headless, viewport, extensionId: addonId,
        experimentApis: Object.keys(manifest.experiment_apis || {}), fullExtensionInstalled: true },
      close };
  } catch (error) {
    await close();
    throw new Error(`Gecko integration failed: ${error.message}\n${log}`, { cause: error });
  }
}
