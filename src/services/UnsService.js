import axios from 'axios';

const screenWidth = window.innerWidth;
const screenHeight = window.innerHeight;

class UnsplashService {
  __url;
  __autor;

  constructor() {
    this.__url = '';
    this.__autor = '';
  };

  getUrl() {
    return this.__url;
  };

  async setImagen() {
    try {
      if(!localStorage.getItem('unsplash')) {
        const res = await axios.get(`https://api.unsplash.com/photos/random`, {
          params: {
            client_id: import.meta.env.VITE_UNSPLASH_API,
            query: "landscape",
            orientation: "landscape",
          }
        })
        localStorage.setItem('unsplash', JSON.stringify(res.data));
        const image = res.data.urls.regular;
        this.__url = `${image}?w=${screenWidth}&fit=crop&auto=format&q=80`;
        //this.__url = image;
      } else {
        const image = JSON.parse(localStorage.getItem('unsplash')).urls.regular;
        this.__url = `${image}?w=${screenWidth}&fit=crop&auto=format&q=80`;
        //this.__url = image;
      }
    } catch(e) {
      console.log(e);
    }
  };
}

export default UnsplashService;
