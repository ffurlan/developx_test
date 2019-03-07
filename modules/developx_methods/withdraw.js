var notes = [100,50,20,10];

////////////////////////////////
/// Calculates the amount of notes needed
////////////////////////////////
module.exports.calculateNotes = (value) => {
    let data = [];
    let current_value = value;
    for (let note of notes) {
        result = checkNotes(current_value, note);
        data.push({ note: note, qty: result.notes });
        current_value = result.remainder;
        if (current_value === 0){
            break;
        }
        
    };

    if (current_value > 0) return [];

    return data;
}

const checkNotes = (value, noteValue) => {
    return {
        notes: Math.floor(value / noteValue),
        remainder: value % noteValue
    }
}




