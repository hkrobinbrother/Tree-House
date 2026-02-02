import PropTypes from "prop-types";
import {
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
  Bar,
  Line,
  ResponsiveContainer,
} from "recharts";

const Chart = ({ isAnimationActive = true, chartData }) => {
  

  return (
    <div style={{ width: "100%", height: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData}>
          <CartesianGrid stroke="#f5f5f5" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />

          <Area
            type="monotone"
            dataKey="order"
            fill="#8884d8"
            stroke="#8884d8"
            isAnimationActive={isAnimationActive}
          />

          <Bar
            dataKey="price"
            barSize={20}
            fill="#413ea0"
            isAnimationActive={isAnimationActive}
          />

          <Line
            type="monotone"
            dataKey="quantity"
            stroke="#ff7300"
            isAnimationActive={isAnimationActive}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

Chart.propTypes = {
  isAnimationActive: PropTypes.bool,
  chartData: PropTypes.array.isRequired,
};

export default Chart;