/* Starter recipes for the quick start. Amounts are rough typical portions written by the app's author
   (not measured, not from a source): grams for kg-priced items, millilitres for litre-priced items, pieces otherwise.
   The owner must correct them to his own recipe. Prices are NOT included on purpose: they change too fast. */
window.Templates = {
  catalog: {
    dough:   { name: 'خمیر پیتزا', unit: 'kg' },
    sauce:   { name: 'سس گوجه / پیتزا', unit: 'kg' },
    mozz:    { name: 'پنیر پیتزا', unit: 'kg' },
    ham:     { name: 'کالباس / ژامبون', unit: 'kg' },
    mush:    { name: 'قارچ', unit: 'kg' },
    pepp:    { name: 'پپرونی', unit: 'kg' },
    chick:   { name: 'سینه مرغ', unit: 'kg' },
    bread:   { name: 'نان ساندویچی', unit: 'piece' },
    mayo:    { name: 'سس مایونز', unit: 'kg' },
    lettuce: { name: 'کاهو', unit: 'kg' },
    pickle:  { name: 'خیارشور', unit: 'kg' },
    bun:     { name: 'نان همبرگر', unit: 'piece' },
    patty:   { name: 'گوشت همبرگر', unit: 'kg' },
    slice:   { name: 'پنیر ورقه‌ای', unit: 'piece' },
    mince:   { name: 'گوشت چرخ‌کرده', unit: 'kg' },
    flat:    { name: 'نان تافتون / لواش', unit: 'piece' },
    tomato:  { name: 'گوجه‌فرنگی', unit: 'kg' },
    onion:   { name: 'پیاز', unit: 'kg' },
    potato:  { name: 'سیب‌زمینی', unit: 'kg' },
    oil:     { name: 'روغن سرخ‌کردنی', unit: 'l' }
  },
  dishes: [
    { id: 'pz1', name: 'پیتزا ساده', lines: [['dough', 250], ['sauce', 60], ['mozz', 120]] },
    { id: 'pz2', name: 'پیتزا مخصوص', lines: [['dough', 250], ['sauce', 60], ['mozz', 120], ['ham', 50], ['mush', 30]] },
    { id: 'pz3', name: 'پیتزا پپرونی', lines: [['dough', 250], ['sauce', 60], ['mozz', 120], ['pepp', 50]] },
    { id: 'sw1', name: 'ساندویچ مرغ', lines: [['bread', 1], ['chick', 110], ['mayo', 25], ['lettuce', 20]] },
    { id: 'sw2', name: 'ساندویچ کالباس', lines: [['bread', 1], ['ham', 80], ['mayo', 25], ['pickle', 20]] },
    { id: 'bg1', name: 'همبرگر', lines: [['bun', 1], ['patty', 100], ['slice', 1], ['mayo', 25], ['lettuce', 15]] },
    { id: 'kb1', name: 'کباب کوبیده با نان', lines: [['mince', 120], ['flat', 1], ['tomato', 50], ['onion', 30]] },
    { id: 'fr1', name: 'سیب‌زمینی سرخ‌کرده', lines: [['potato', 200], ['oil', 30]] }
  ]
};
