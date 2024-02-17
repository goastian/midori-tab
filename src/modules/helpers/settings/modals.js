import variables from 'config/variables';
import { toast } from 'react-toastify';

/**
 * It creates a link to a file, and then clicks it
 * @param data - the data you want to save
 * @param [filename=file] - the name of the file to be saved
 * @param [type=text/json] - the type of file you want to save.
 */
export function saveFile(data, filename = 'file', type = 'text/json') {
  if (typeof data === 'object') {
    data = JSON.stringify(data, undefined, 4);
  }

  const blob = new Blob([data], { type });

  const event = document.createEvent('MouseEvents');
  const a = document.createElement('a');

  a.href = window.URL.createObjectURL(blob);
  a.download = filename;
  a.dataset.downloadurl = [type, a.download, a.href].join(':');

  // i need to see what all this actually does, i think wessel wrote this function
  event.initMouseEvent(
    'click',
    true,
    false,
    window,
    0,
    0,
    0,
    0,
    0,
    false,
    false,
    false,
    false,
    0,
    null,
  );
  a.dispatchEvent(event);
}

/**
 * It takes all the settings from localStorage and saves them to a file
 */
export function exportSettings() {
  const settings = {};

  Object.keys(localStorage).forEach((key) => {
    settings[key] = localStorage.getItem(key);
  });

  let date = new Date();
  // Format the date as YYYY-MM-DD_HH-MM-SS
  let formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}-${date.getMinutes().toString().padStart(2, '0')}-${date.getSeconds().toString().padStart(2, '0')}`;
  let filename = `mue_settings_backup_${formattedDate}.json`;
  saveFile(settings, filename);
  variables.stats.postEvent('tab', 'Settings exported');
}

/**
 * It takes a JSON file of Mue settings, parses it, and then sets the localStorage values to the values in the
 * file.
 * @param e - The JSON settings string to import
 */
export function importSettings(e) {
  const content = JSON.parse(e);

  Object.keys(content).forEach((key) => {
    localStorage.setItem(key, content[key]);
  });

  toast(variables.getMessage('toasts.imported'));
  variables.stats.postEvent('tab', 'Settings imported');
}

/**
 * It returns an array of objects with a value and label property for the Mue sliders.
 * @param type - The type of slider you want to use.
 * @returns An object with keys of either zoom, toast, background or experimental.
 */
export function values(type) {
  const marks = {
    zoom: [
      { value: 10, label: '0.1x' },
      { value: 100, label: '1x' },
      { value: 200, label: '2x' },
      { value: 400, label: '4x' },
    ],
    toast: [
      { value: 500, label: '0.5s' },
      { value: 1000, label: '1s' },
      { value: 1500, label: '1.5s' },
      { value: 2000, label: '2s' },
      { value: 2500, label: '2.5s' },
      { value: 3000, label: '3s' },
      { value: 4000, label: '4s' },
      { value: 5000, label: '5s' },
    ],
    background: [
      { value: 0, label: '0%' },
      { value: 25, label: '25%' },
      { value: 50, label: '50%' },
      { value: 75, label: '75%' },
      { value: 100, label: '100%' },
    ],
    experimental: [
      { value: 0, label: '0s' },
      { value: 500, label: '0.5s' },
      { value: 1000, label: '1s' },
      { value: 1500, label: '1.5s' },
      { value: 2000, label: '2s' },
      { value: 2500, label: '2.5s' },
      { value: 3000, label: '3s' },
      { value: 4000, label: '4s' },
      { value: 5000, label: '5s' },
    ],
  };

  return marks[type] || [];
}

export async function getTitleFromUrl(url) {
  let title;
  try {
    let response = await fetch(url);
    if (response.redirected) {
      response = await fetch(response.url);
    }
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    title = doc.title;
  } catch (e) {
    title = url;
  }

  return title;
}

export function isValidUrl(url) {
  // regex: https://ihateregex.io/expr/url/
  // eslint-disable-next-line no-useless-escape
  const urlRegex =
    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._~#=]{1,256}\.[a-zA-Z0-9()]{1,63}\b([-a-zA-Z0-9()!@:%_.~#?&=]*)/;

  return urlRegex.test(url);
}
