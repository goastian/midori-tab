import variables from 'modules/variables';
import { useState, Fragment } from 'react';
import { Info, LocationOn, PhotoCamera, Crop as Resolution, Person as Photographer, GetApp as Download } from '@mui/icons-material';
//import Hotkeys from 'react-hot-keys';
//import { lat2tile, lon2tile } from 'modules/helpers/background/widget';

const toDataURL = async (url) => {
  const res = await fetch(url);
  return URL.createObjectURL(await res.blob());
};

const formatText = (text) => {
  return text.toLowerCase().replaceAll(',', '').replaceAll(' ', '-');
};

const downloadImage = async (info) => {
  const link = document.createElement('a');
  link.href = await toDataURL(info.url);
  link.download = `mue-${formatText(info.credit)}-${formatText(info.location)}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  variables.stats.postEvent('feature', 'Background download');
};

export default function PhotoInformation({ info, url, api }) {
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  if (info.hidden === true || !info.credit) {
    return null;
  }

  // remove unsplash and pexels text
  const unsplash = variables.language.getMessage(variables.languagecode, 'widgets.background.unsplash');
  const pexels = variables.language.getMessage(variables.languagecode, 'widgets.background.pexels');
  const photographer = info.credit.split(` ${unsplash}`)[0].split(` ${pexels}`);

  let credit = info.credit;
  let photo = variables.language.getMessage(variables.languagecode, 'widgets.background.credit');

  // unsplash and pexels credit
  if (info.photographerURL && info.photographerURL !== '' && !info.offline && api) {
    if (api === 'unsplash') {
      photo = <a href={info.photoURL + '?utm_source=mue'} target='_blank' rel='noopener noreferrer'>{photo}</a>;
      credit = <><a href={info.photographerURL} target='_blank' rel='noopener noreferrer'>{info.credit}</a> <a href='https://unsplash.com?utm_source=mue' target='_blank' rel='noopener noreferrer'>{unsplash}</a></>;
    } else {
      photo = <a href={info.photoURL} target='_blank' rel='noopener noreferrer'>{photo}</a>;
      credit = <><a href={info.photographerURL} target='_blank' rel='noopener noreferrer'>{info.credit}</a> <a href='https://pexels.com' target='_blank' rel='noopener noreferrer'>{pexels}</a></>;
    }
  }

  const ddgProxy = (localStorage.getItem('ddgProxy') === 'true');

  // get resolution
  const img = new Image();
  img.onload = (event) => {
    setWidth(event.target.width);
    setHeight(event.target.height);
  };
  img.src = (ddgProxy && !info.offline && !url.startsWith('data:')) ? variables.constants.DDG_IMAGE_PROXY + url : url;

  // info is still there because we want the favourite button to work
  if (localStorage.getItem('photoInformation') === 'false') {
    return (
      <div className='photoInformation'>
        <h1>{photo} <span id='credit'>{credit}</span></h1>
        <div style={{ display: 'none' }}>
          <span id='infoLocation'>{info.location || 'N/A'}</span>
          <span id='infoCamera'>{info.camera || 'N/A'}</span>
          <span id='infoResolution'>{width}x{height}</span>
        </div>
      </div>
    );
  }

  const downloadEnabled = (localStorage.getItem('downloadbtn') === 'true') && !info.offline && !info.photographerURL && api;
  /*const downloadBackground = () => { 
    if (downloadEnabled) {
      downloadImage(info);
    }
  };

  const showBackgroundInformation = () => {
    const element = document.querySelector('.infoCard');
    if (element) {
      if (element.style.display === 'none' || element.style.display === '') {
        element.style.display = 'block';
      } else {
        element.style.display = 'none';
      }
    }
  };*/

  {/*const photoMap = () => {
    if (localStorage.getItem('photoMap') !== 'true' || !info.latitude || !info.longitude) {
      return null;
    }

    const zoom = 12;
    const lat = lat2tile(info.latitude, zoom);
    const lon = lon2tile(info.longitude, zoom);
    const tile = `${variables.constants.MAPBOX_URL}/styles/v1/mapbox/streets-v11/tiles/${zoom}/${lon}/${lat}?access_token=${info.maptoken}`;
    
    let icon = variables.constants.CDN_URL + '/mapbox/mapbox-logo-dark.png';
    if (document.body.classList.contains('dark')) {
      icon = variables.constants.CDN_URL + '/mapbox/mapbox-logo-white.png';
    }

    return (
      <Fragment key='test'>
        <a href={`https://www.openstreetmap.org/?mlat=${info.latitude}&mlon=${info.longitude}`} target='_blank' rel='noopener noreferrer'>
          <img className='locationMap' src={tile} alt='location' draggable={false}/>
        </a>
        <br/>
        <img className='mapboxLogo' src={icon} alt='mapbox logo' draggable={false}/>
        <span className='mapCopyright'>
          <a href='https://www.mapbox.com/about/maps/' target='_blank' rel='noopener noreferrer'> © Mapbox</a>, <a href='https://www.openstreetmap.org/about/' target='_blank' rel='noopener noreferrer'>© OpenStreetMap</a>. <a href='https://www.mapbox.com/map-feedback/' target='_blank' rel='noopener noreferrer'>Improve this map</a>.
        </span>
      </Fragment>
    );
  }*/}

  return (
    <div className='photoInformation'>
      <h1>{photo} <span id='credit'>{credit}</span></h1>
      <Info className='photoInformationHover'/>
      <div className='infoCard'>
        <Info className='infoIcon'/>
        <h1>{variables.language.getMessage(variables.languagecode, 'widgets.background.information')}</h1>
        <hr/>
        {/*photoMap()*/}
        {/* fix console error by using fragment and key */}
        {info.location && info.location !== 'N/A' ? <Fragment key='location'>
          <LocationOn/>
          <span id='infoLocation'>{info.location}</span>
        </Fragment> : null}
        {info.camera && info.camera !== 'N/A' ? <Fragment key='camera'>
          <PhotoCamera/>
          <span id='infoCamera'>{info.camera}</span>
        </Fragment> : null}
        <Resolution/>
        <span id='infoResolution'>{width}x{height}</span>
        <Photographer/>
        <span>{photographer}</span>
        {downloadEnabled ? 
          <>
            <Download/>
            <span className='download' onClick={() => downloadImage(info)}>{variables.language.getMessage(variables.languagecode, 'widgets.background.download')}</span>
          </> 
        : null}
      </div>
      {/*variables.keybinds.downloadBackground && variables.keybinds.downloadBackground !== '' ? <Hotkeys keyName={variables.keybinds.downloadBackground} onKeyDown={() => downloadBackground()} /> : null*/}
      {/*variables.keybinds.showBackgroundInformation && variables.keybinds.showBackgroundInformation !== '' ? <Hotkeys keyName={variables.keybinds.showBackgroundInformation} onKeyDown={() => showBackgroundInformation()} /> : null*/}
    </div>
  );
}
