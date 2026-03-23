function rateConvert(amt) {
    if (amt === null || amt === undefined || amt === '') return '';

    const num = Number(amt);
    if (isNaN(num)) return '';

    return num.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDate(dateStr) {
  const date = new Date(dateStr);

  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleString("en-GB", { month: "short" }).toUpperCase();
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
}

module.exports = { rateConvert,formatDate };