const path = require('path');
const buildDir = path.resolve(__dirname, 'build');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack'); // Import webpack to access built-in plugins
const TerserPlugin = require('terser-webpack-plugin'); // Import TerserPlugin

const config = {
    entry: {
        'useeio_widgets': './src/main.ts',
        'useeio_widgets.min': './src/main.ts'  // Separate entry for minified version
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ]
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js']
    },
    output: {
        filename: '[name].js', // This will output both `useeio_widgets.js` and `useeio_widgets.min.js`
        path: buildDir + '/lib',
        libraryTarget: 'var',
        library: ['useeio'],
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'src/**/*.html', to: path.resolve(__dirname, 'build', '', '[name][ext]') },
                { from: 'src/**/*.css', to: path.resolve(__dirname, 'build', '', '[name][ext]') },
                {
                    from: 'node_modules/apexcharts/dist/apexcharts.min.js',
                    to: buildDir + '/lib/apexcharts.min.js',
                    toType: 'file'
                },
                {
                    from: 'node_modules/apexcharts/dist/apexcharts.css',
                    to: buildDir + '/lib/apexcharts.css',
                    toType: 'file'
                },
            ]
        }),
        // Enable HMR globally
        new webpack.HotModuleReplacementPlugin(),
    ],
    externals: {
        "apexcharts": "apexcharts",
    },
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                include: /\.min\.js$/, // Only minify files with .min.js extension
            }),
        ],
    },
    // Configure devServer
    devServer: {
        static: {
            directory: path.join(__dirname, 'build'),
        },
        hot: false,
        liveReload: true,
        open: true,
        port: 3000, // or any port of your choice
    },
};

module.exports = (_env, argv) => {
    if (argv.mode === 'development') {
        config.devtool = 'source-map';
        config.optimization = { minimize: false }; // No minification in development mode
    }
    return config;
};
