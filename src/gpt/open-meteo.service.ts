import { Injectable, Logger } from '@nestjs/common';
import { Function } from 'gigachat/interfaces';
import {
  OpenMeteoForecastRequest,
  OpenMeteoForecastResponse,
} from './interfaces/interfaces';

@Injectable()
export class OpenMeteoService {
  private readonly logger = new Logger(OpenMeteoService.name);
  private readonly baseUrl = 'https://api.open-meteo.com/v1/forecast';

  /**
   * Возвращает список всех доступных инструментов (functions) для Open-Meteo API
   */
  getAvailableTools(): Function[] {
    return [
      {
        name: 'get_weather_forecast',
        description:
          'Получить прогноз погоды для указанных координат. Возвращает почасовые и дневные данные о погоде.',
        parameters: {
          type: 'object',
          properties: {
            latitude: {
              type: 'number',
              description:
                'Широта в градусах (от -90 до 90). Например, 52.52 для Берлина.',
            },
            longitude: {
              type: 'number',
              description:
                'Долгота в градусах (от -180 до 180). Например, 13.405 для Берлина.',
            },
            forecast_days: {
              type: 'number',
              description:
                'Количество дней прогноза (от 1 до 16). По умолчанию 7 дней.',
            },
            hourly: {
              type: 'array',
              description:
                'Список часовых переменных погоды. Можно выбрать несколько.',
              items: {
                type: 'string',
                enum: [
                  'temperature_2m',
                  'relative_humidity_2m',
                  'dewpoint_2m',
                  'apparent_temperature',
                  'precipitation_probability',
                  'precipitation',
                  'rain',
                  'showers',
                  'snowfall',
                  'snow_depth',
                  'weather_code',
                  'pressure_msl',
                  'surface_pressure',
                  'cloud_cover',
                  'cloud_cover_low',
                  'cloud_cover_mid',
                  'cloud_cover_high',
                  'visibility',
                  'wind_speed_10m',
                  'wind_direction_10m',
                  'wind_gusts_10m',
                  'uv_index',
                  'is_day',
                ],
              },
            },
            daily: {
              type: 'array',
              description:
                'Список дневных переменных погоды. Можно выбрать несколько.',
              items: {
                type: 'string',
                enum: [
                  'weather_code',
                  'temperature_2m_max',
                  'temperature_2m_min',
                  'apparent_temperature_max',
                  'apparent_temperature_min',
                  'sunrise',
                  'sunset',
                  'daylight_duration',
                  'sunshine_duration',
                  'uv_index_max',
                  'precipitation_sum',
                  'rain_sum',
                  'showers_sum',
                  'snowfall_sum',
                  'precipitation_hours',
                  'precipitation_probability_max',
                  'wind_speed_10m_max',
                  'wind_gusts_10m_max',
                  'wind_direction_10m_dominant',
                  'shortwave_radiation_sum',
                ],
              },
            },
            timezone: {
              type: 'string',
              description:
                'Часовой пояс в формате IANA (например, Europe/Moscow, America/New_York) или auto. По умолчанию auto.',
            },
          },
          required: ['latitude', 'longitude'],
        },
      },
    ];
  }

  /**
   * Выполняет запрос к Open-Meteo API для получения прогноза погоды
   */
  async getWeatherForecast(
    params: OpenMeteoForecastRequest,
  ): Promise<OpenMeteoForecastResponse> {
    try {
      const url = new URL(this.baseUrl);
      url.searchParams.set('latitude', params.latitude.toString());
      url.searchParams.set('longitude', params.longitude.toString());

      if (params.forecast_days) {
        url.searchParams.set('forecast_days', params.forecast_days.toString());
      }

      if (params.hourly && params.hourly.length > 0) {
        url.searchParams.set('hourly', params.hourly.join(','));
      } else {
        // По умолчанию добавляем основные переменные
        url.searchParams.set(
          'hourly',
          'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
        );
      }

      if (params.daily && params.daily.length > 0) {
        url.searchParams.set('daily', params.daily.join(','));
      } else {
        // По умолчанию добавляем основные переменные
        url.searchParams.set(
          'daily',
          'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
        );
      }

      if (params.timezone) {
        url.searchParams.set('timezone', params.timezone);
      }

      this.logger.log(`Requesting weather forecast: ${url.toString()}`);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(
          `Open-Meteo API error: ${response.status} ${response.statusText}`,
        );
      }

      const data: OpenMeteoForecastResponse = await response.json();
      this.logger.log('Weather forecast received successfully');
      return data;
    } catch (error) {
      this.logger.error('Error fetching weather forecast', error);
      throw new Error(
        `Failed to fetch weather forecast: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
