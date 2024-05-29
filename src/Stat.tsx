enum Stat {
    Might = 'Might',
    Grace = 'Grace',
    Skill = 'Skill',
    Brains = 'Brains',
    Wits = 'Wits',
    Charm = 'Charm',
    Heart = 'Heart',
    Luck = 'Luck'
}

const StatDescription: {[stat in Stat]: string} = {
    [Stat.Might]: 'Physical power and resilience. Smash, drag, lift, weather.',
    [Stat.Grace]: 'Agility and composure. Dodge, balance, dance.',
    [Stat.Skill]: 'Sleight and craftmanship. Picklock, craft, shoot, paint.',
    [Stat.Brains]: 'Knowledge and judgment. Solve, deduce, recall, plan.',
    [Stat.Wits]: 'Quick-thinking and awareness. React, notice, adapt, trick.',
    [Stat.Charm]: 'Allure and Influence. Persuade, inspire, deceive, entertain.',
    [Stat.Heart]: 'Determination and empathy. Endure, recover, connect, encourage.',
    [Stat.Luck]: 'Unpredictable fortune. Gamble, stumble upon, avoid, hope.'
}