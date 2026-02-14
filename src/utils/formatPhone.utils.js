export const formatPhone = (phone) => {
    if (!phone) return null;

    const cleaned = String(phone).replace(/[^0-9+]/g, "");
    const withoutPlus = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;

    if (withoutPlus.startsWith("91")) {
        return `+${withoutPlus}`;
    }

    return `+91${withoutPlus}`;
};

export default formatPhone;
