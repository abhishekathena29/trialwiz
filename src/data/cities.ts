// Reference coordinates for the city-name fallback path (when the user won't share GPS location).
export const CITIES: Record<string, [number, number]> = {
  Delhi: [28.6139, 77.209],
  'New Delhi': [28.6139, 77.209],
  Gurugram: [28.4595, 77.0266],
  Noida: [28.5355, 77.391],
  Mumbai: [19.076, 72.8777],
  'Navi Mumbai': [19.033, 73.0297],
  Pune: [18.5204, 73.8567],
  Bengaluru: [12.9716, 77.5946],
  Chennai: [13.0827, 80.2707],
  Hyderabad: [17.385, 78.4867],
  Kolkata: [22.5726, 88.3639],
  Ahmedabad: [23.0225, 72.5714],
  Jaipur: [26.9124, 75.7873],
  Lucknow: [26.8467, 80.9462],
  Chandigarh: [30.7333, 76.7794],
  Indore: [22.7196, 75.8577],
  Bhopal: [23.2599, 77.4126],
  Nagpur: [21.1458, 79.0882],
  Raipur: [21.2514, 81.6296],
  Kochi: [9.9312, 76.2673],
  Thiruvananthapuram: [8.5241, 76.9366],
  Patna: [25.5941, 85.1376],
  Guwahati: [26.1445, 91.7362],
  Varanasi: [25.3176, 82.9739],
  Surat: [21.1702, 72.8311],
  Vadodara: [22.3072, 73.1812],
  Coimbatore: [11.0168, 76.9558],
  Visakhapatnam: [17.6868, 83.2185],
  Bhubaneswar: [20.2961, 85.8245],
  Ludhiana: [30.901, 75.8573],
  Amritsar: [31.634, 74.8723],
  Mangaluru: [12.9141, 74.856],
  Mysuru: [12.2958, 76.6394],
  Vijayawada: [16.5062, 80.648],
  Madurai: [9.9252, 78.1198],
  Ranchi: [23.3441, 85.3096],
  Dehradun: [30.3165, 78.0322],
  Jodhpur: [26.2389, 73.0243],
  Agra: [27.1767, 78.0081],
  Kanpur: [26.4499, 80.3319],
};

export function matchCity(input: string): string {
  if (!input) return '';
  const keys = Object.keys(CITIES);
  const lower = input.toLowerCase();
  return (
    keys.find((c) => c.toLowerCase() === lower) ||
    keys.find((c) => c.toLowerCase().startsWith(lower)) ||
    keys.find((c) => c.toLowerCase().includes(lower)) ||
    input
  );
}
