import { Helmet } from "react-helmet-async";
import AddPlantForm from "../../../components/Form/AddPlantForm";
import { imagUpload } from "../../../api/utils";
import useAuth from "../../../hooks/useAuth";
import { useState } from "react";
import useAxiosSecure from "../../../hooks/useAxiosSecure";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

const AddPlant = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const axiosSecure = useAxiosSecure()
  const [uploadImage,setUploadImage] = useState({image:{name:"Upload Button"} })
  const [loading,setLoading] = useState(false)
  // handle from submit
  console.log(uploadImage)

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true)
    const form = e.target;
    const name = form.name.value;
    const description = form.description.value;
    const category = form.category.value;
    const price = parseFloat(form.price.value);
    const quantity = parseInt(form.quantity.value);
    const image = form.image.files[0];
    const imageUrl = await imagUpload(image);

    // seller info

    const seller = {
      name: user?.displayName,
      image: user?.photoURL,
      email: user?.email,
    };
    // crate plant data object

    const plantData = {
      name,
      category,
      description,
      price,
      quantity,
      image: imageUrl,
      seller,
    };


    console.table(plantData)
    // save plant in db

    try {
      // post rew
      
      await axiosSecure.post("/plants",plantData)
      toast.success("Data Added Successfully")
      navigate("/dashboard/my-inventory")
    } catch (err) {
      console.log(err)
      toast.error("Data Not Added")
      
    }finally{
      setLoading(false)
    } 


  };

  return (
    <div>
      <Helmet>
        <title>Add Plant | Dashboard</title>
      </Helmet>

      {/* Form */}
      <AddPlantForm handleSubmit={handleSubmit} uploadImage={uploadImage} setUploadImage={setUploadImage} loading={loading} />
    </div>
  );
};

export default AddPlant;
