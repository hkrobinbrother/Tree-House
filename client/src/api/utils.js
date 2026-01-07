// upload image and return image url

import axios from "axios"

export const imagUpload = async imageData =>{
        const fromData = new FormData()
    fromData.append("image",imageData)
      const {data} = await axios.post(`https://api.imgbb.com/1/upload?key=${import.meta.env.VITE_IMGBB_API_KEY}`,fromData)

      
      return data.data.display_url
}