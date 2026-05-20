exports.getPriority = (category) => {
  if (category === 'road') return 'high';
  if (category === 'water') return 'medium';
  return 'low';
};