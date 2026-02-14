export const generatePassword = (name = "") => {
    const cleanName = name.replace(/\s+/g, ""); // remove spaces

    const randomNumber = Math.floor(1000 + Math.random() * 9000); // 4 digits

    const symbols = "@!#$%";
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];

    // Example: Sidd2301!
    return `${cleanName}${randomNumber}${symbol}`;
};
