import { FC } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import type {
  CustomSettingDefinition,
  SettingValue,
} from '@nuclearplayer/plugin-sdk';

import { widgetRegistry } from '../../services/widgetRegistry';
import { usePluginStore } from '../../stores/pluginStore';

type CustomWidgetFieldProps = {
  definition: CustomSettingDefinition;
  value: SettingValue | undefined;
  setValue: (v: SettingValue) => void;
};

export const CustomWidgetField: FC<CustomWidgetFieldProps> = ({
  definition,
  value,
  setValue,
}) => {
  const { t } = useTranslation('settings');
  const pluginId = (definition.source as { pluginId: string }).pluginId;
  const Widget = widgetRegistry.get(pluginId, definition.widgetId);
  const pluginApi = usePluginStore((state) => state.plugins[pluginId]?.api);

  if (!Widget) {
    // The plugin may still be loading (registration is async) or may have
    // failed; don't throw, or the whole settings section unmounts.
    return (
      <div className="text-foreground-secondary text-sm">
        {t('customWidgetUnavailable', { pluginId })}
      </div>
    );
  }

  return (
    <Widget
      value={value}
      setValue={setValue}
      definition={definition}
      api={pluginApi}
    />
  );
};
