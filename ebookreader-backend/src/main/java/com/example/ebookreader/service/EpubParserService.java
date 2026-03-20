package com.example.ebookreader.service;

import com.example.ebookreader.dto.EbookDto;
import org.springframework.stereotype.Service;
import org.w3c.dom.*;
import org.xml.sax.SAXException;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@Service
public class EpubParserService {

    public EbookDto parseEpub(String filePath) {
        EbookDto ebook = new EbookDto();

        try (ZipFile zipFile = new ZipFile(filePath)) {
            DocumentBuilder builder = DocumentBuilderFactory.newInstance().newDocumentBuilder();

            // container.xml
            ZipEntry containerEntry = zipFile.getEntry("META-INF/container.xml");
            Document containerDoc = builder.parse(zipFile.getInputStream(containerEntry));
            String opfPath = containerDoc.getElementsByTagName("rootfile").item(0).getAttributes()
                    .getNamedItem("full-path").getNodeValue();
            String basePath = "";
            if (opfPath.contains("/")) basePath = opfPath.substring(0, opfPath.lastIndexOf("/") + 1);

            // .opf
            ZipEntry opfEntry = zipFile.getEntry(opfPath);
            Document opfDoc = builder.parse(zipFile.getInputStream(opfEntry));

            // metadata
            String title = opfDoc.getElementsByTagName("dc:title").item(0).getTextContent();
            String author = opfDoc.getElementsByTagName("dc:creator").item(0).getTextContent();
            ebook.setTitle(title);
            ebook.setAuthor(author);

            // manifest
            HashMap<String, String> map = new HashMap<>();
            NodeList manifestItems = opfDoc.getElementsByTagName("item");
            for (int i = 0; i < manifestItems.getLength(); i++) {
                Element item = (Element) manifestItems.item(i);
                String href = java.net.URLDecoder.decode(item.getAttribute("href"), StandardCharsets.UTF_8);
                map.put(item.getAttribute("id"), basePath + href);
            }

            // spine
            ArrayList<String> readingOrder = new ArrayList<>();
            NodeList spineItems = opfDoc.getElementsByTagName("itemref");
            for (int i = 0; i < spineItems.getLength(); i++) {
                Element itemref = (Element) spineItems.item(i);
                readingOrder.add(map.get(itemref.getAttribute("idref")));
            }
            ebook.setSpine(readingOrder);

            // toc (.ncx)
            ArrayList<EbookDto.TocItem> tocList = new ArrayList<>();
            try {
                Node tocAttribute = opfDoc.getElementsByTagName("spine").item(0).getAttributes().
                        getNamedItem("toc");
                if (tocAttribute != null) {
                    String ncxId = tocAttribute.getNodeValue();
                    String ncxPath = map.get(ncxId);
                    if (ncxPath != null) {
                        ZipEntry ncxEntry = zipFile.getEntry(ncxPath);
                        Document ncxDoc = builder.parse(zipFile.getInputStream(ncxEntry));
                        NodeList navPoints = ncxDoc.getElementsByTagName("navPoint");

                        for (int i = 0; i < navPoints.getLength(); i++) {
                            Element navPoint = (Element) navPoints.item(i);
                            String humanReadableTitle = navPoint.getElementsByTagName("text").item(0).
                                    getTextContent();
                            String src = navPoint.getElementsByTagName("content").item(0).getAttributes().
                                    getNamedItem("src").getNodeValue();
                            src = URLDecoder.decode(src, StandardCharsets.UTF_8);
                            EbookDto.TocItem tocItem = new EbookDto.TocItem();
                            tocItem.setTitle(humanReadableTitle);
                            tocItem.setHref(basePath + src);
                            tocList.add(tocItem);
                        }
                    }
                }
            } catch (DOMException | SAXException | IOException e) {
                System.out.println("Warning: Could not parse Table of Contents (.ncx)");
                throw new RuntimeException(e);
            }
            ebook.setToc(tocList);
        } catch (IOException | ParserConfigurationException | SAXException e) {
            throw new RuntimeException(e);
        }
        return ebook;
    }

    public String getChapterContent(String filePath, String chapterPath) {
        try (ZipFile zipFile = new ZipFile(filePath)) {
            ZipEntry entry = zipFile.getEntry(chapterPath);
            if (entry == null) return "<h1>Error: Chapter not found in EPUB</h1>";
            try (InputStream is = zipFile.getInputStream(entry)) {
                return new String(is.readAllBytes(), StandardCharsets.UTF_8);
            }
        } catch (IOException e) {
            return "<h1>Error reading chapter: " + e.getMessage() + "</h1>";
        }
    }

    public byte[] getAsset(String filePath, String assetPath) {
        try (ZipFile zipFile = new ZipFile(filePath)) {
            ZipEntry entry = zipFile.getEntry(assetPath);
            if (entry == null) return null;
            try (InputStream is = zipFile.getInputStream(entry)) {
                return is.readAllBytes();
            }
        } catch (IOException e) {
            return null;
        }
    }
}
