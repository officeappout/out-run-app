const getDistanceStr = (distance: number): string => {
  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(1)} ק"מ`;
  }
  return `${Math.round(distance)} מ'`;
};

export default getDistanceStr;