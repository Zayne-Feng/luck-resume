import { iconCatalog, iconCategories } from '../resume/icons.ts';

export const iconDiscoveryEnglish: Record<string, string> = {
  ...Object.fromEntries(iconCatalog.map((icon) => [icon.name, icon.english])),
  ...Object.fromEntries(iconCategories.map((group) => [group.name, group.english])),
  查找图标: 'Find an icon',
  搜索图标: 'Search icons',
  输入名称或关键词: 'Enter a name or keyword',
  图标分类: 'Icon category',
  全部图标: 'All icons',
  '{name}（当前图标）': '{name} (current icon)',
  '找到 {count} 个图标，在上方列表中选择': '{count} icons found; choose from the list above',
  '没有匹配的图标，请调整搜索或分类': 'No icons found; adjust the search or category',
};
