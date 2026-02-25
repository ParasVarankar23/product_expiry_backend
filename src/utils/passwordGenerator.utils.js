export const generatePassword = (name = "") => {
    const cleanName = String(name || "").replace(/\s+/g, ""); // remove spaces

    // Use first four characters of the name if available, otherwise fallback to "User"
    const prefix = cleanName.length >= 4 ? cleanName.slice(0, 4) : (cleanName || "User");

    const randomNumber = Math.floor(1000 + Math.random() * 9000); // 4 digits

    const symbols = "@!#$%";
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];

    // Example: Rohi2301!
    return `${prefix}${randomNumber}${symbol}`;
};
