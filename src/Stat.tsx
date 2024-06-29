export enum Stat {
    Might = 'Might',
    Grace = 'Grace',
    Skill = 'Skill',
    Brains = 'Brains',
    Wits = 'Wits',
    Charm = 'Charm',
    Heart = 'Heart',
    Luck = 'Luck'
}

export const StatDescription: {[stat in Stat]: string} = {
    [Stat.Might]: 'Physical power and endurance. Smash, lift, weather, intimidate.',
    [Stat.Grace]: 'Agility and composure. Dodge, balance, dance, land.',
    [Stat.Skill]: 'Sleight and craftmanship. Picklock, craft, shoot, fix, pickpocket.',
    [Stat.Brains]: 'Knowledge and judgment. Solve, deduce, recall, plan.',
    [Stat.Wits]: 'Quick-thought and awareness. React, notice, quip, trick.',
    [Stat.Charm]: 'Allure and Influence. Persuade, inspire, deceive, entertain, impress.',
    [Stat.Heart]: 'Determination and empathy. Resist, recover, connect, encourage, comfort.',
    [Stat.Luck]: 'Spirit and fortune. Gamble, discover, coincide, hope.'
}