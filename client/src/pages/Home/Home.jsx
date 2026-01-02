import { Helmet } from 'react-helmet-async'
import Plants from '../../components/Home/Plants'

const Home = () => {
  return (
    <div>
      <Helmet>
        <title> Tree House | Buy Your Desired Plant</title>
      </Helmet>
      <Plants />
    </div>
  )
}

export default Home
