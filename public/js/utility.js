export function rateConvert(amt) {
    if (amt === null || amt === undefined || amt === '') return '';

    const num = Number(amt);
    if (isNaN(num)) return '';

    return num.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}