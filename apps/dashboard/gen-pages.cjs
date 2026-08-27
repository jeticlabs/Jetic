const fs = require('fs');
const pages = [
  ['Workspace', ['Overview', 'Scenarios', 'Runs']],
  ['Agent', ['Agents', 'Tools', 'Context', 'Memory']],
  ['Environment', ['APIs', 'Email', 'OAuth', 'Webhooks']],
  ['Observability', ['Traces', 'Events']],
  ['Misc', ['Settings', 'Docs']]
];

pages.forEach(([category, components]) => {
  components.forEach(comp => {
    fs.writeFileSync(`src/pages/${category}/${comp}.tsx`, `export function ${comp}() {\n  return (\n    <div className="p-8">\n      <h1 className="text-2xl font-semibold text-white">${comp}</h1>\n      <p className="mt-4 text-zinc-400">This is the ${comp} page.</p>\n    </div>\n  );\n}\n`);
  });
});
