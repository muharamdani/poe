import fetch from 'cross-fetch';

export const scrape = async () => {
    const _pb = await fetch("https://poe.com/login"),
        pbCookie = _pb.headers.get("set-cookie")?.split(";")[0];
    const _setting = await fetch(
        'https://poe.com/api/settings',
        { headers: { cookie: `${pbCookie}` } },
    );
    if (_setting.status !== 200) throw new Error("Failed to fetch token");
    const appSettings = await _setting.json(),
        { tchannelData: { channel: channelName } } = appSettings;
    return {
        pbCookie,
        channelName,
        appSettings,
    };
};

export default scrape;
