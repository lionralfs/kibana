/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getPageObjects, getService }: FtrProviderContext) {
  const esArchiver = getService('esArchiver');
  const filterBar = getService('filterBar');
  const queryBar = getService('queryBar');
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');
  const kibanaServer = getService('kibanaServer');
  const PageObjects = getPageObjects([
    'common',
    'error',
    'discover',
    'timePicker',
    'unifiedSearch',
    'lens',
    'security',
    'spaceSelector',
    'header',
  ]);
  const monacoEditor = getService('monacoEditor');

  const defaultSettings = {
    'discover:enableSql': true,
  };

  async function setDiscoverTimeRange() {
    await PageObjects.timePicker.setDefaultAbsoluteRange();
  }

  describe('discover field visualize button', () => {
    before(async () => {
      await kibanaServer.uiSettings.replace(defaultSettings);
    });
    beforeEach(async () => {
      await esArchiver.loadIfNeeded('x-pack/test/functional/es_archives/logstash_functional');
      await kibanaServer.importExport.load(
        'x-pack/test/functional/fixtures/kbn_archiver/lens/lens_basic.json'
      );
      await PageObjects.common.navigateToApp('discover');
      await setDiscoverTimeRange();
    });

    after(async () => {
      await esArchiver.unload('x-pack/test/functional/es_archives/logstash_functional');
      await kibanaServer.importExport.unload(
        'x-pack/test/functional/fixtures/kbn_archiver/lens/lens_basic.json'
      );
    });

    it('shows "visualize" field button', async () => {
      await PageObjects.discover.clickFieldListItem('bytes');
      await PageObjects.discover.expectFieldListItemVisualize('bytes');
    });

    it('visualizes field to Lens and loads fields to the dimesion editor', async () => {
      await PageObjects.discover.findFieldByName('bytes');
      await PageObjects.discover.clickFieldListItemVisualize('bytes');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await retry.try(async () => {
        const dimensions = await testSubjects.findAll('lns-dimensionTrigger');
        expect(dimensions).to.have.length(2);
        expect(await dimensions[1].getVisibleText()).to.be('Median of bytes');
      });
    });

    it('should preserve app filters in lens', async () => {
      await filterBar.addFilter('bytes', 'is between', '3500', '4000');
      await PageObjects.discover.findFieldByName('geo.src');
      await PageObjects.discover.clickFieldListItemVisualize('geo.src');
      await PageObjects.header.waitUntilLoadingHasFinished();

      expect(await filterBar.hasFilter('bytes', '3,500 to 4,000')).to.be(true);
    });

    it('should preserve query in lens', async () => {
      await queryBar.setQuery('machine.os : ios');
      await queryBar.submitQuery();
      await PageObjects.discover.findFieldByName('geo.dest');
      await PageObjects.discover.clickFieldListItemVisualize('geo.dest');
      await PageObjects.header.waitUntilLoadingHasFinished();

      expect(await queryBar.getQueryString()).to.equal('machine.os : ios');
    });

    it('should visualize correctly using adhoc data view', async () => {
      await PageObjects.discover.createAdHocDataView('logst', true);
      await PageObjects.header.waitUntilLoadingHasFinished();

      await testSubjects.click('discoverEditVisualization');
      await PageObjects.header.waitUntilLoadingHasFinished();

      await retry.try(async () => {
        const selectedPattern = await PageObjects.lens.getDataPanelIndexPattern();
        expect(selectedPattern).to.eql('logst*');
      });
    });

    it('should visualize correctly text based language queries', async () => {
      await PageObjects.discover.selectTextBaseLang('SQL');
      await PageObjects.header.waitUntilLoadingHasFinished();
      await monacoEditor.setCodeEditorValue(
        'SELECT extension, AVG("bytes") as average FROM "logstash-*" GROUP BY extension'
      );
      await testSubjects.click('querySubmitButton');
      await PageObjects.header.waitUntilLoadingHasFinished();

      await testSubjects.click('textBased-visualize');

      await retry.try(async () => {
        const dimensions = await testSubjects.findAll('lns-dimensionTrigger-textBased');
        expect(dimensions).to.have.length(2);
        expect(await dimensions[1].getVisibleText()).to.be('average');
      });
    });
  });
}
